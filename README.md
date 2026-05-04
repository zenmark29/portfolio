# portfolio
An interesting way to manage my portfolio
## todo
- REFRESH: Your plan's baseline quota will refresh on 4/23/2026, 2:28:16 PM.
- complete the webauthn implementation
- add the etrade client to the application so I can pull information directly without typing it in.
    - This will require some research into the etrade api. I might have to add additional information to identify the link between the two systems.
- update the README so that people can use the application.
- make certain that branch coverage doesn't decrease when the code coverage runs. Might need nyc to do that.
- Add agent rules
    - Agent Rule: "Whenever I ask you to implement a new feature in a subclass of BaseObject, run the tests with nyc (or c8). If the coverage for that specific file drops below 100%, do not mark the task as complete—write more mocks/tests until the coverage is restored."
    - "Before any major commit, run npm run lint (ESLint) and osv-scanner. If the complexity of any function exceeds 15 or there are critical security vulnerabilities, pause and generate a 'Quality Report' artifact explaining the risk."
    - maybe add these:
        - eslint-plugin-sonarjs: This is the official plugin from the Sonar team. It brings Sonar’s logic for "Cognitive Complexity" and "Code Smells" directly into your editor.
        - eslint-plugin-security: Identifies potential security hotspots (like eval() or dangerous regex).
        - osv-scanner
        - daily dependency checks for security issues and dependency updates
