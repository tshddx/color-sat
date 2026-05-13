After any code changes, verify with:

- `vp check --fix` (always use `--fix` to skip a step in case there are fixable errors)
- `vp test`

Project conventions:

- Use `zod` at public module boundaries for runtime validation of plain serializable inputs.
- Use `better-result` for expected error handling in solver APIs instead of throwing exceptions.
