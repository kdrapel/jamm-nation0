param([int]$Port = 1995, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$nationRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$nationPort = $Port
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $nationPort)
try { $listener.Start() } catch { Write-Host "Port $nationPort is already in use. Close the other local server and try again."; exit 1 }
Write-Host "Nation Zero is running at http://localhost:$nationPort"
Write-Host 'Keep this window open. Close it to stop the local server.'
if (-not $NoBrowser) { Start-Process "http://localhost:$nationPort" }
$utf8 = [Text.UTF8Encoding]::new($false)
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'; '.json'='application/json'; '.woff2'='font/woff2' }
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream(); $stream.ReadTimeout = 3000
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $first = $reader.ReadLine()
      if (-not $first) { continue }
      while ($reader.ReadLine()) {}
      $target = ($first -split ' ')[1]
      $relative = [Uri]::UnescapeDataString(($target -split '\?')[0]).TrimStart('/')
      if (-not $relative) { $relative = 'index.html' }
      $file = [IO.Path]::GetFullPath([IO.Path]::Combine($nationRoot, $relative.Replace('/', '\')))
      $code = '200 OK'
      $mime = $types[[IO.Path]::GetExtension($file)]
      if (-not $mime) { $mime = 'application/octet-stream' }
      if (-not $file.StartsWith($nationRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { $code = '403 Forbidden'; $body = $utf8.GetBytes('Forbidden') }
      elseif (-not [IO.File]::Exists($file)) { $code = '404 Not Found'; $body = $utf8.GetBytes('Not found') }
      else { $body = [IO.File]::ReadAllBytes($file) }
      $header = "HTTP/1.1 $code`r`nContent-Type: $mime`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCross-Origin-Opener-Policy: same-origin`r`nCross-Origin-Embedder-Policy: require-corp`r`n`r`n"
      $bytes = $utf8.GetBytes($header)
      $stream.Write($bytes, 0, $bytes.Length); $stream.Write($body, 0, $body.Length)
    } catch { } finally { $client.Close() }
  }
} finally { $listener.Stop() }
