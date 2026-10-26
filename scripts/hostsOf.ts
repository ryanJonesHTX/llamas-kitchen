// The host list between "scheme://[credentials@]" and the path; never the credentials or query.
export function hostsOf(connectionString: string): string {
  const authority = connectionString.replace(/^mongodb(\+srv)?:\/\//, '').split(/[/?]/)[0]
  return authority.slice(authority.lastIndexOf('@') + 1)
}
