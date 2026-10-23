import { describe, expect, it } from 'vitest'
import { roleForEmail } from '../../lib/roles'

describe('roleForEmail', () => {
  it('makes an email listed in ADMIN_EMAILS an admin', () => {
    expect(roleForEmail('chef@example.com', 'chef@example.com')).toBe('admin')
  })

  it('finds the email anywhere in a comma-separated list', () => {
    expect(
      roleForEmail('b@example.com', 'a@example.com,b@example.com,c@example.com')
    ).toBe('admin')
  })

  it('compares emails case-insensitively', () => {
    expect(roleForEmail('Chef@Example.COM', 'chef@example.com')).toBe('admin')
    expect(roleForEmail('chef@example.com', 'CHEF@EXAMPLE.COM')).toBe('admin')
  })

  it('ignores whitespace around entries in the list', () => {
    expect(
      roleForEmail('b@example.com', ' a@example.com ,  b@example.com  ')
    ).toBe('admin')
  })

  it('makes an email not in the list a user', () => {
    expect(roleForEmail('guest@example.com', 'chef@example.com')).toBe('user')
  })

  it('does not match on a partial email', () => {
    expect(roleForEmail('chef@example.com.evil', 'chef@example.com')).toBe(
      'user'
    )
    expect(roleForEmail('chef@example.com', 'sous-chef@example.com')).toBe(
      'user'
    )
  })

  it('makes everyone a user when ADMIN_EMAILS is empty', () => {
    expect(roleForEmail('chef@example.com', '')).toBe('user')
  })

  it('never makes an empty email an admin, even with empty list entries', () => {
    expect(roleForEmail('', '')).toBe('user')
    expect(roleForEmail('', 'a@example.com,')).toBe('user')
  })

  it('makes everyone a user when ADMIN_EMAILS is not set', () => {
    expect(roleForEmail('chef@example.com', undefined)).toBe('user')
  })
})
