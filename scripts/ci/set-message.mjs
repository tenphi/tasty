export default async function setMessage({
  header,
  body,
  prNumber,
  repo,
  github,
}) {
  const commentList = await github.paginate(
    'GET /repos/:owner/:repo/issues/:issue_number/comments',
    { ...repo, issue_number: prNumber },
  );

  const commentBody = `${header}\n\n${body}`;

  const existing = commentList.find((c) => c.body.startsWith(header));

  if (existing) {
    await github.rest.issues.updateComment({
      ...repo,
      comment_id: existing.id,
      body: commentBody,
    });
  } else {
    await github.rest.issues.createComment({
      ...repo,
      issue_number: prNumber,
      body: commentBody,
    });
  }
}
