# Contributing to ClipMind

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository and clone your fork
2. Set up the development environment (see [README.md](./README.md))
3. Create a feature branch: `git checkout -b feat/your-feature`
4. Make your changes and add tests
5. Open a pull request

## Development Setup

```bash
# Backend
cp .env.example .env
# Edit .env with your CLIPMIND_GEMINI_API_KEY and CLIPMIND_VIDEO_DIR

uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"

# Frontend
cd frontend && npm install
```

## Running Tests

```bash
# Backend
pytest

# Frontend
cd frontend && npm run lint && npm run build
```

## Code Style

- **Python**: [ruff](https://docs.astral.sh/ruff/) for linting, PEP 8 conventions, type annotations on all functions
- **TypeScript**: ESLint with the project config, Tailwind CSS for styling
- Keep files under 400 lines; extract components/helpers when approaching the limit

## Pull Request Guidelines

- One feature or fix per PR
- Include tests for new functionality
- Update documentation if you change behavior or add configuration options
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:
  `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

## Security

Please do **not** commit API keys, personal paths, or any user data.
Always use environment variables (see `.env.example`).

If you find a security vulnerability, please open a GitHub issue or contact the maintainers directly rather than posting it publicly.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
