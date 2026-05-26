# Contributing to AI ERP System

Thank you for your interest in contributing to the AI ERP System! This document provides guidelines and instructions for contributing to this project.

## Getting Started

1. **Fork the repository** and clone it locally
2. **Install dependencies** using `pnpm install`
3. **Set up your environment** by copying `.env.example` to `.env` and filling in the required values
4. **Run the development server** with `pnpm run dev`

## Development Workflow

### Making Changes

1. Create a new branch from `main` for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes, following the coding standards below

3. Test your changes:
   ```bash
   pnpm run check    # Type checking
   pnpm run test     # Run tests
   pnpm run format   # Format code
   ```

4. Commit your changes with a clear, descriptive commit message

5. Push your branch and create a pull request

### Coding Standards

- **TypeScript**: All code should be written in TypeScript with proper type annotations
- **Formatting**: Use Prettier for code formatting (`pnpm run format`)
- **Testing**: Add tests for new features and bug fixes when applicable
- **Type Safety**: Ensure `pnpm run check` passes without errors

### Strict-mode ratchet

The repo's main `tsconfig.json` has `noImplicitAny` and `strictNullChecks` disabled
because the legacy code can't pass with them on. To prevent the codebase from drifting
further away from strict, we ratchet:

1. `tsconfig.strict-full.json` enables both flags across the whole project.
2. `.strict-baseline.json` records the per-file error count at the time of the last update.
3. CI runs `pnpm run strict:check`, which fails the build if any file's count *grows*.

Workflow:

| Command                | When to run                                                |
|------------------------|------------------------------------------------------------|
| `pnpm run strict:audit`  | See current strict-error counts per file                  |
| `pnpm run strict:check`  | Same gate CI runs — verifies no file exceeds its baseline |
| `pnpm run strict:update` | After fixing strict errors, lower the baseline             |

Rules of thumb:

- Touching a file already in the baseline? Try to leave it with the same or fewer
  strict errors than you found it. CI will catch you if you don't.
- Fixed some errors? Run `pnpm run strict:update` and commit the updated baseline.
- New code should be strict-clean — adding a brand-new file with strict errors will
  introduce a new baseline entry that reviewers will (rightly) push back on.

Files in the manually-curated `tsconfig.strict.json` allowlist are held to a stricter
bar: they must pass `pnpm run check:strict` with zero errors. Add a file there only
once you've confirmed it (and its transitive imports) are fully strict-clean.

### Project Structure

- `client/` - React frontend application
- `server/` - Express backend with tRPC
- `shared/` - Shared types and utilities
- `drizzle/` - Database schema and migrations

## Reporting Issues

When reporting issues, please include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Any relevant error messages or screenshots
- Your environment (OS, Node version, etc.)

## Feature Requests

Feature requests are welcome! Please:

- Check if the feature has already been requested
- Provide a clear description of the feature
- Explain the use case and benefits
- Consider contributing the implementation yourself

## Pull Request Guidelines

- Keep pull requests focused on a single feature or bug fix
- Update documentation if you're changing functionality
- Ensure all tests pass and type checking succeeds
- Write clear, descriptive commit messages
- Link to any related issues in your PR description

## Code Review Process

All pull requests will be reviewed by project maintainers. We may suggest changes, improvements, or alternatives. Please be patient and responsive to feedback.

## Questions?

If you have questions about contributing, feel free to open an issue with the "question" label.

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.
