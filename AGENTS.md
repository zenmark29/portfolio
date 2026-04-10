# Architectural Decisions

## Directory Layout
The project follows a strict separation of concerns using a sibling directory pattern within `src/`. This ensures that production code in `core/` remains clean of testing utilities, while `test/` mirrors the structure for easy navigation.

## Why this layout?
- **Isolation**: Keeps logic and verification separate.
- **Portability**: Simplifies packaging the `core` directory for production.
- **Consistency**: Matches the established object-oriented patterns used throughout the project.

## Project Structure
- All source code lives in `src/`.
- `src/core/`: Contains all class definitions and logic.
- `src/test/`: Contains all unit tests.
- **Sibling Relationship**: `core` and `test` are siblings.
- **Relative Imports**: Tests must import core objects using `../core/[FileName].js`.

## Example Layout
.
├── .cursorrules
├── AGENTS.md
├── package.json
└── src/
    ├── core/
    └── test/


# PWA Configuration
This project is a Progressive Web App (PWA) optimized for local execution. It provides the UI benefits of a web app (HTML/CSS/JS) with the performance and data sovereignty of a local Node.js application.

## Offline First
The application must remain functional without an internet connection, relying entirely on the local SQLite database.
