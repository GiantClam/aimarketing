import assert from "node:assert/strict"
import https from "node:https"
import test from "node:test"

import { writerFetch } from "./network"

function setEnv(
  name: "NODE_ENV" | "LOCAL_DEV_HTTP_PROXY" | "NODE_TLS_REJECT_UNAUTHORIZED",
  value: string | undefined,
) {
  const env = process.env as Record<string, string | undefined>
  if (typeof value === "string") {
    env[name] = value
    return
  }

  delete env[name]
}

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDJGpOWAhgJnR7E
ZYu424fbjM+lAiUKQTtvgcJRMVQZO1ld7R5nVK0R3WXfmgPIgaT0C/nAhGga8UZw
rV0VYO8ACNsM4TLa+3qgwKkfYG5iY/X1+3X2ekPKS3nw7G0FPDo+l1jNpaXm8uHy
9NMt2NQSc3zei5U9eyVfJ7FNbXLkTBc8+ZlekOIf+YkqsRjaFdnOenzjqY4mpC49
KKu7Q2Bf0Z6ofUnbjrP+A8NV0hJmlpmzwTI31NtD8JetbwTusteVjOHF9tWZ5shp
2D5A+252UKlTKg/4cjdUe3P5hL4l8BkKrbtVO/y2gS43dxWKTiZ20KQxoxLPLn3W
VlnNjqq9AgMBAAECggEAJ5JzODFxSXMBeuQAen+4XBt5QJ8LatkrOOXvtspeIhjr
nO/r66ld5QYL5dQIqovYSa2Rl7B2S9buZX23s10/qmITuJUXzL9vgfJnVSVEk1fY
Lm8s5zNn44a2mBHt4fnX/DkL4GuYGbnxfD1w0LS6BmdzStdspox07iSBXxsKYKG/
JMAcMCywReUVtxqGj/S9JNZPol0Rdy5lO4PyJyJViyRTD/cHlFkUAsfGePe2AHOY
xGUGTtGuUbxouxjMVu9jch65k1wkGSCze9BDb03AIaHM9aFukrZ3B2fgwxObWYHd
NmjmIqKPl3m4wxwYuD7c0mGf9ijZaOYZ+pjgCLj6gQKBgQDjzVYlYsfFtTTJbJp5
ULMKqbz3ApDBk/o1bmmzsDz+mHqt5nRsTjBLBbAgNpETdDWFLf3NjXbbhewg4DUp
KqedXhKD9//iDi15ff6VtCIVa+jUj8s5FcILy6p2J7XJCTYAf6jJbLfSljH3okgh
PtKi7ZojZp9sh8qSogkDJeEUCwKBgQDh/zdxwSrtrQtY6PZFwqaE8s5EmG2G7iQC
I69zsa9rrMgMTjitDGcjLSKKVUj08EhwymmczrwSGKSnP4nAI2n9NEI7xy5i7NHV
BnSrvCaKSJ7OlLZrIXn7TH2dC9iEakfwCpSTqhcta7e0bB1AHow/OTQ7tyWkp/Sy
BOueZ6hxVwKBgQDRtbpUeHdIPuT1eRFMFUp9yny3OJliW4O/pIGSde/wwRZO+RS8
j85NglL9lL5Bln2euRQpIs4EkWkrarwFxcrASFXrP2dFB6A9dAvmbQnjho+0/xsq
1ijpCvlGBJCJHf2kv+D2bStcpgAh5Ddaw6bNbsazSEoDc469JoX9a+WkuQKBgQCv
Srclq6/xdIRVrTTAPU/N1Us6l4R04Sfa5PUE5vBqszTjnpSFXRZuiWa+J5KUMf/u
RIIQl6X231hvRXBCMPXX6P3qwf7vykKjWgOK5UB7iAJtt5malPe5fMX91x9U7d7o
iDxgINEjcOansigqAMfFjkg+fTtccM3yerCLSFm1twKBgQCtzGowuipvAE+uBCzu
/bWSFNJ4gTrqFrx4ijS/BV44cT/iwzxgr8Am1CHY5huB8Q+RzIkrIRgA6lbnd4Fs
1c0cFk/2XHmibktznkZo+1bI0HlVn8ZvDc0DwHXpEvQh+mT0dnEp5CiLfrg8ROyL
L2vbMph1/78ywjCH9AgrYFSLlg==
-----END PRIVATE KEY-----`

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDAzCCAeugAwIBAgIUMNf0wmUmUK5o4qK4HHXAGCyTu/8wDQYJKoZIhvcNAQEL
BQAwETEPMA0GA1UEAwwGbHZoLm1lMB4XDTI2MDYyMjAzNTcxNFoXDTI2MDYyMzAz
NTcxNFowETEPMA0GA1UEAwwGbHZoLm1lMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A
MIIBCgKCAQEAyRqTlgIYCZ0exGWLuNuH24zPpQIlCkE7b4HCUTFUGTtZXe0eZ1St
Ed1l35oDyIGk9Av5wIRoGvFGcK1dFWDvAAjbDOEy2vt6oMCpH2BuYmP19ft19npD
ykt58OxtBTw6PpdYzaWl5vLh8vTTLdjUEnN83ouVPXslXyexTW1y5EwXPPmZXpDi
H/mJKrEY2hXZznp846mOJqQuPSiru0NgX9GeqH1J246z/gPDVdISZpaZs8EyN9Tb
Q/CXrW8E7rLXlYzhxfbVmebIadg+QPtudlCpUyoP+HI3VHtz+YS+JfAZCq27VTv8
toEuN3cVik4mdtCkMaMSzy591lZZzY6qvQIDAQABo1MwUTAdBgNVHQ4EFgQUExp6
sX3DfJQ0VEY886wGRzVf/ngwHwYDVR0jBBgwFoAUExp6sX3DfJQ0VEY886wGRzVf
/ngwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAIKB+kEGkugq/
61BTym658LmDXP8UvPerRug54TCtzYO5F+JXYNDf3gKQzGEdr157tv8Prhfdh0F6
It3TYw6Qu1piZQFD7Bzp81i/PZljbgX5XglcqE+KSWqT3sHoPVuj1zXLIpKG6vhZ
CKgyP4SPm+JCrpaDuFWm+go4umJ0IiXun9VkQto1VJ+ULbAoDxaRpacqTqSGFhcR
Dr2YuSwwws7nb0RaM+WBWVPwyfXJTQq/is7nv2eT0Ea2fFCcZ6mXDCnjgd8Pg+34
2/tIkjFDdddTYa7p5N6WPBdHAAu3JOMDOFw4bDE9dUDMdJBgnW+LDqXnwZ0URS+T
a+4PuGez+w==
-----END CERTIFICATE-----`

test("writerFetch falls back to direct connection when configured proxy is refused", async () => {
  const previousProxy = process.env.LOCAL_DEV_HTTP_PROXY
  const previousNodeEnv = process.env.NODE_ENV
  const previousTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  setEnv("NODE_ENV", "development")
  setEnv("LOCAL_DEV_HTTP_PROXY", "http://127.0.0.1:7890")
  setEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0")

  let hitCount = 0
  const server = https.createServer({ key: TEST_KEY, cert: TEST_CERT }, (req, res) => {
    hitCount += 1
    res.writeHead(200, { "content-type": "text/plain" })
    res.end(`ok:${req.url}`)
  })

  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", () => resolve()))
  const address = server.address()
  assert(address && typeof address === "object")

  try {
    const response = await writerFetch(`https://lvh.me:${address.port}/asset`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "ok:/asset")
    assert.equal(hitCount, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    setEnv("LOCAL_DEV_HTTP_PROXY", previousProxy)
    setEnv("NODE_ENV", previousNodeEnv)
    setEnv("NODE_TLS_REJECT_UNAUTHORIZED", previousTlsReject)
  }
})
