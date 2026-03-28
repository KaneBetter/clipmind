---
name: capcut-mate
description: 通过 CapCut Mate API 自动生成剪映草稿，支持批量添加视频、转场、路径修复和草稿注册
user_invocable: true
---

# CapCut Mate 自动化粗剪

通过 CapCut Mate Docker API 生成剪映 10.2 兼容草稿。

## 架构

```
CapCut Mate (Docker, port 30000)
  ↓ HTTP API (http://localhost:30000/docs)
Python 脚本 (rough_cut_by_location.py)
  ↓ 生成草稿 + 修复路径 + 注册
剪映 Pro (macOS)
```

## 环境要求

- Docker + docker-compose（运行 CapCut Mate）
- Python 3.11+（运行脚本）
- 剪映 Pro macOS（查看草稿）

## 使用步骤

### 1. 启动 CapCut Mate

```bash
cd /Users/chenkaiqin/code/capcut-mate
docker-compose pull && docker-compose up -d
```

### 2. 启动本地文件服务器

```bash
cd "/Users/chenkaiqin/Movies/2026父母2月美国"
python3 -m http.server 18080 --bind 0.0.0.0
```

### 3. 运行粗剪脚本

```bash
cd /Users/chenkaiqin/code/video

# 测试（每组8个视频, ~200个总计）
python3 rough_cut_by_location.py --limit 8

# 全部视频
python3 rough_cut_by_location.py

# 仅特定地点
python3 rough_cut_by_location.py --only "05-拉斯维加斯"

# 查看分组
python3 rough_cut_by_location.py --list
```

### 4. 重启剪映查看

草稿自动复制到 `~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/` 下。

## 25 条时间线架构

### 分组策略

脚本使用 `video_by_location.json` 的预聚类结果，将视频分为：

- **16 个景点**: 直接映射 cluster label → timeline ID（`CLUSTER_TO_TIMELINE` 字典）
- **公路段**: 未命中景点的 cluster，按路线顺序确定 prev/next 景点，形成 "A→B" 路段
- **合并规则**: 公路段视频数 < `ROAD_MERGE_THRESHOLD`(10) 时合并到目的地景点

### 多时间线实现

1. 为每个时间线单独调 CapCut Mate API（create_draft → add_videos → add_captions → add_audios → save_draft）
2. 取第一个草稿作为项目基础
3. 创建 `Timelines/` 目录，每条时间线一个子目录

### 关键约束

- **目录名 = draft ID**: 每条时间线目录名必须与其 `draft_info.json` 中的 `id` 字段一致，否则剪映无法打开
- **CapCut Mate 模板 ID 固定**: 所有草稿共享同一模板 ID，需在组装时 patch 每条时间线的 `id` 为唯一 UUID
- **main_timeline_id**: `project.json` 中必须与根 `draft_info.json` 的 `id` 一致
- 首条时间线复用根 draft 的 ID，其余生成新 UUID

### Timelines 目录结构

```
draft_root/
├── draft_info.json           # 根（= 第一条时间线内容）
├── draft_content.json
├── Timelines/
│   ├── project.json          # 时间线索引
│   ├── project.json.bak
│   ├── <root-draft-id>/      # 时间线01（目录名 = root draft id）
│   │   ├── draft_info.json   # 内容（明文 JSON, id 与目录名一致）
│   │   ├── draft_info.json.bak
│   │   ├── template.tmp
│   │   └── common_attachment/
│   ├── <new-uuid-2>/         # 时间线02（id 已 patch 为此 UUID）
│   │   └── ...
│   └── ...
```

### project.json 格式

```json
{
  "config": {"color_space": -1, "render_index_track_mode_on": true, "use_float_render": false},
  "create_time": <microseconds>,
  "id": "<main-timeline-uuid>",
  "main_timeline_id": "<main-timeline-uuid>",
  "timelines": [
    {"create_time": <us>, "id": "<uuid>", "is_marked_delete": false, "name": "San Jose 圣何塞", "update_time": <us>}
  ],
  "update_time": <microseconds>,
  "version": 0
}
```

## 字幕系统 (4 层)

### add_captions API

```
POST /openapi/capcut-mate/v1/add_captions
```

关键参数:
- `font_size`: 整数，**默认值 15**（经测试：8 太小看不清，30 巨大铺满屏幕，15-18 适中）
- `alignment`: 0=左对齐, 1=居中, 2=右对齐 (0-5)
- `transform_x/y`: 位移（1920x1080 画布，原点在中心，范围约 ±960/±540）
- `text_color`: 十六进制颜色
- `has_shadow`: 阴影开关
- `bold`: 加粗开关
- `border_color`: 描边颜色（可选）

### 当前字号配置

| 层 | 字号 | 位置 | 用途 |
|----|------|------|------|
| 标题 | 18 | 顶部居中 (y=-450) | 地点名称，开头显示 4s |
| 旁白 | 15 | 底部居中 (y=430) | 影视飓风风格叙事文案 |
| 地标 | 8 | 左下角 (x=-800, y=400) | GPS 匹配的地标介绍 |
| 日期 | 8 | 右上角 (x=850, y=-480) | 日期变化时显示 |

### 旁白文案 (NARRATIONS)

- 每个时间线预设 3-5 句叙事文案
- 按片段顺序分配，每个片段显示一句
- 影视飓风风格：诗意、电影感描述
- 不要在文案中使用 emoji（会被剪映渲染为巨大图标）

## 视频裁剪规则

```python
源视频 < 1.5s     → 跳过
源视频 1.5s~3.5s  → 全片使用
源视频 ≥ 3.5s     → 去掉前后各 1s，取中间 5s (最长)
                    source_start = 1.0 + (usable - clip_dur) / 2.0
```

## 音乐配置

- 音乐源: `/Users/chenkaiqin/Documents/music/`（3 个子目录）
- 暂存: 复制到 `BASE_DIR/music/` 供文件服务器访问（`stage_music()`）
- 选配: `MUSIC_PICKS` 字典按歌名匹配时间线意境
- 路径修复: 按 materials 顺序匹配（CapCut Mate 重命名音频为随机 ID）

## API 端点速查

| 端点 | 用途 | 注意 |
|------|------|------|
| `create_draft` | 创建空草稿 | 返回 draft_url |
| `add_videos` | 添加视频 | 一次调用=一条轨道，video_infos 为 JSON 字符串 |
| `add_audios` | 添加音频 | audio_infos 为 JSON 字符串 |
| `add_captions` | 添加字幕 | captions 为 JSON 字符串，font_size 默认 15 |
| `save_draft` | 保存到磁盘 | 输出到 /app/output/draft/{id}/ |
| `get_draft` | 查看草稿 | |

完整 API 文档: http://localhost:30000/docs

## 路径修复

CapCut Mate 下载媒体到 Docker 内部 `/app/output/draft/{id}/assets/`。
脚本将 `draft_info.json` 和 `draft_content.json` 中的路径替换为本地绝对路径。

- 视频: 按顺序匹配 `materials.videos[]`
- 音频: 按顺序匹配 `materials.audios[]`（不能按文件名，因为被重命名为随机 ID）

## 文件说明

| 文件 | 用途 |
|------|------|
| `rough_cut_by_location.py` | 主脚本：25 时间线 + 多时间线 + CapCut Mate API |
| `rough_cut_capcut_mate.py` | 旧版：单时间线粗剪 |
| `rough_cut_music_sync.py` | 旧版：音乐节拍同步粗剪 |
| `video_gps_data.json` | 视频 GPS 坐标数据 |
| `video_by_location.json` | 按景点预聚类的视频列表（16 景点 + 64 公路段） |
