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

# Testing & Coverage
This project maintains strict code coverage standards to ensure reliability.
- **100% Coverage Requirement**: All logic changes must be accompanied by corresponding unit tests. Statement, Branch, and Function coverage must remain at **100%**.
- **Execution**: Always run `npm run coverage` after making logic modifications.
- **Restoration**: If your changes cause coverage to drop below 100%, you must proactively identify the missing paths and write the necessary unit tests to restore complete coverage before finishing your task.
- **Mocking**: Use `node:test` built-in mock functions to isolate database, filesystem, or external API calls where appropriate.
