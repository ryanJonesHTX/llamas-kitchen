import { describe, expect, it } from 'vitest'
import { signUploadParams } from '../../lib/uploadSignature'

describe('signUploadParams', () => {
  // Known vectors from Cloudinary's "Generating authentication signatures"
  // docs (https://cloudinary.com/documentation/authentication_signatures,
  // fetched 2026-10-23). Both vectors use SHA-1, the documented SDK default.
  it('matches the Cloudinary docs vector for a timestamp-only upload', () => {
    expect(signUploadParams({ timestamp: 1315060510 }, 'abcd')).toBe(
      'a21ad0f63beb4de2e5575204b79ab90bffb02c10',
    )
  })

  it('matches the Cloudinary docs vector with eager and public_id, sorting params by name', () => {
    expect(
      signUploadParams(
        {
          timestamp: 1315060510,
          public_id: 'sample_image',
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e')
  })

  it('ignores file, cloud_name, resource_type and api_key, which Cloudinary never signs', () => {
    const signed = { timestamp: 1315060510, public_id: 'sample_image' }
    const withExcluded = {
      ...signed,
      file: 'https://www.example.com/sample.jpg',
      cloud_name: 'demo',
      resource_type: 'image',
      api_key: '1234',
    }
    expect(signUploadParams(withExcluded, 'abcd')).toBe(signUploadParams(signed, 'abcd'))
  })

  it('changes when a signed param changes', () => {
    expect(signUploadParams({ timestamp: 1315060510, folder: 'recipes' }, 'abcd')).not.toBe(
      signUploadParams({ timestamp: 1315060510, folder: 'other' }, 'abcd'),
    )
  })
})
