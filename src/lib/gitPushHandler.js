export async function createFixBranch(repoName, issueDescription, githubToken) {
  const branchName = 'fix/morpheus-' + Date.now().toString(36)
  const owner = 'jadiel054'

  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/main`, {
    headers: { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json' }
  })
  if (!refRes.ok) throw new Error('Failed to get main ref: ' + refRes.status)
  const refData = await refRes.json()
  const mainSha = refData.object.sha

  const branchRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + githubToken, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainSha })
  })
  if (!branchRes.ok) throw new Error('Failed to create branch: ' + branchRes.status)

  return { branchName, mainSha, owner }
}

export async function commitToBranch(owner, repo, branch, filePath, content, message, githubToken) {
  const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + githubToken, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ content, encoding: 'utf-8' })
  })
  if (!blobRes.ok) throw new Error('Failed to create blob: ' + blobRes.status)
  const blobData = await blobRes.json()

  const branchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
    headers: { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json' }
  })
  const branchData = await branchRes.json()
  const parentSha = branchData.object.sha

  const baseTreeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${parentSha}`, {
    headers: { Authorization: 'Bearer ' + githubToken, Accept: 'application/vnd.github+json' }
  })
  const baseCommitData = await baseTreeRes.json()
  const baseTreeSha = baseCommitData.tree.sha

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + githubToken, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blobData.sha }] })
  })
  if (!treeRes.ok) throw new Error('Failed to create tree: ' + treeRes.status)
  const treeData = await treeRes.json()

  const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + githubToken, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message, tree: treeData.sha, parents: [parentSha] })
  })
  if (!commitRes.ok) throw new Error('Failed to create commit: ' + commitRes.status)
  const commitData = await commitRes.json()

  await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + githubToken, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ sha: commitData.sha, force: false })
  })

  return { commitSha: commitData.sha, treeSha: treeData.sha }
}

export async function createPullRequest(owner, repo, branch, title, body, githubToken) {
  const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + githubToken, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ title, body, head: branch, base: 'main' })
  })
  if (!prRes.ok) {
    const err = await prRes.json().catch(() => ({}))
    if (err.errors?.[0]?.message?.includes('No commits between')) return { prUrl: null, note: 'No diff — branch is identical to main' }
    throw new Error('Failed to create PR: ' + (err.message || prRes.status))
  }
  const prData = await prRes.json()
  return { prUrl: prData.html_url, prNumber: prData.number }
}

export async function fullFixPipeline(repoName, filePath, newContent, issueDescription, githubToken) {
  const { branchName, owner } = await createFixBranch(repoName, issueDescription, githubToken)
  const commitMessage = 'fix: ' + issueDescription.slice(0, 72)
  await commitToBranch(owner, repoName, branchName, filePath, newContent, commitMessage, githubToken)
  const prTitle = 'Fix: ' + issueDescription.slice(0, 60)
  const prBody = '## Correcao automatica via MORPHEUS\n\n**Issue**: ' + issueDescription + '\n\n**Arquivo modificado**: `' + filePath + '`\n\n---\n*Gerado por MORPHEUS Nebuchadnezzar v1.0*'
  const pr = await createPullRequest(owner, repoName, branchName, prTitle, prBody, githubToken)
  return { branchName, owner, repo: repoName, ...pr }
}
