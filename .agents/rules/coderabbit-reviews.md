# CodeRabbit Review Inspection & Implementation

Whenever CodeRabbit performs a review or provides feedback (on pull requests, commits, or issue discussions):
1. **Actively Inspect All Comments & Suggestions**:
   - Query GitHub using `gh` CLI (`gh pr view --comments`, `gh api repos/{owner}/{repo}/pulls/{number}/reviews`, `gh api repos/{owner}/{repo}/pulls/{number}/comments`, or commit comments) to retrieve every comment, inline suggestion, security notice, and architectural feedback from CodeRabbit.
2. **Review & Validate Each Item**:
   - Carefully review each suggestion for correctness, safety, performance, and adherence to project requirements.
3. **Implement Approved Changes**:
   - Apply fixes for any bugs, edge cases, performance bottlenecks, or cleanups pointed out by CodeRabbit.
   - Run verification builds and tests before committing.
4. **Report Back Clearly**:
   - Summarize what CodeRabbit reviewed, which items were addressed, and any trade-offs made.
