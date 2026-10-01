import { createHash, randomBytes } from 'node:crypto'

export const createOneTimeToken = () => {
  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  return { token, tokenHash }
}

export const hashOneTimeToken = (token) =>
  createHash('sha256').update(String(token)).digest('hex')