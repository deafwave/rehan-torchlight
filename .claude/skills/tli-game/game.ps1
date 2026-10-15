# Drive Torchlight: Infinite in the background. Coordinates are game client pixels (3440x1440 here).
#   game.ps1 shot  <out.png> [x y w h] [scale]          screenshot (PrintWindow: works unfocused/covered)
#   game.ps1 key   <K> [K...]                           posted key presses (ESC B SPACE R E Q F A-Z 0-9 F1-F10)
#   game.ps1 click <x> <y>                              left click (cursor flick, restored)
#   game.ps1 hover <x> <y> <out.png> [x y w h] [scale]  hold the cursor there, screenshot the tooltip, restore
#   game.ps1 aimkey <x> <y> <KEY>                       press KEY with the cursor at x,y (aimed skills: Blink)
#   game.ps1 wheel <x> <y> <notches>                    mouse wheel, negative = down (cursor flick)
#   game.ps1 measure <out.png> [secs=32] [KEY every-s]  Recount on the dummy, wait (posting KEY on a timer), shoot panel
#   game.ps1 burst <out.png> <frames> <ms> <x y w h> [cols=6] [scale=0.5]   timestamped contact sheet
# Keys are posted window messages after a posted WM_ACTIVATEAPP/WM_ACTIVATE/WM_SETFOCUS — the game drops input
# it thinks is unfocused, and these never touch the user's keyboard or focus. The game reads the REAL cursor
# position for clicks/hover/wheel, so those move the cursor for ~0.2s and put it back.
param([Parameter(Position = 0)][string]$cmd, [Parameter(Position = 1, ValueFromRemainingArguments)][string[]]$rest)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class TG {
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint c, uint t);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$h = (Get-Process -Name torchlight_infinite -ErrorAction Stop | Select-Object -First 1).MainWindowHandle
$cr = New-Object TG+RECT; [TG]::GetClientRect($h, [ref]$cr) | Out-Null
$cw = $cr.R; $ch = $cr.B
$vk = @{ ESC = 0x1B; TAB = 0x09; ENTER = 0x0D; SPACE = 0x20 }
65..90 | ForEach-Object { $vk[[string][char]$_] = $_ }; 48..57 | ForEach-Object { $vk[[string][char]$_] = $_ }
1..10 | ForEach-Object { $vk["F$_"] = 0x6F + $_ }

function Activate { [TG]::PostMessage($h, 0x1C, [IntPtr]1, [IntPtr]0) | Out-Null; [TG]::PostMessage($h, 0x06, [IntPtr]1, [IntPtr]0) | Out-Null
  [TG]::PostMessage($h, 0x07, [IntPtr]0, [IntPtr]0) | Out-Null; Start-Sleep -Milliseconds 60 }
function Key([string]$k) { $v = $vk[$k.ToUpper()]; if (!$v) { throw "unknown key $k" }
  $sc = [TG]::MapVirtualKey($v, 0); Activate
  [TG]::PostMessage($h, 0x100, [IntPtr]$v, [IntPtr](1 -bor ($sc -shl 16))) | Out-Null; Start-Sleep -Milliseconds 120
  [TG]::PostMessage($h, 0x101, [IntPtr]$v, [IntPtr]([int64]1 -bor ($sc -shl 16) -bor (1 -shl 30) -bor ([int64]1 -shl 31))) | Out-Null }
function ScreenOf([int]$x, [int]$y) { $p = New-Object TG+POINT; $p.X = $x; $p.Y = $y; [TG]::ClientToScreen($h, [ref]$p) | Out-Null; $p }
function Flick([int]$x, [int]$y, [scriptblock]$while, [int]$hold = 200) {
  # the game reads the real cursor; never move it while the user is in another app
  if ([TG]::GetForegroundWindow() -ne $h -and -not $env:TLI_FORCE_FLICK) { throw "game is not in front: refusing to move the user's cursor (set TLI_FORCE_FLICK=1 to override)" }
  $saved = New-Object TG+POINT; [TG]::GetCursorPos([ref]$saved) | Out-Null
  $s = ScreenOf $x $y; $lp = [IntPtr](($y -shl 16) -bor ($x -band 0xFFFF)); Activate
  try { [TG]::SetCursorPos($s.X, $s.Y) | Out-Null; [TG]::PostMessage($h, 0x200, [IntPtr]0, $lp) | Out-Null
    Start-Sleep -Milliseconds 60; & $while $lp; Start-Sleep -Milliseconds $hold }
  finally { [TG]::SetCursorPos($saved.X, $saved.Y) | Out-Null }
}
function Click([int]$x, [int]$y) { Flick $x $y { param($lp) [TG]::PostMessage($h, 0x201, [IntPtr]1, $lp) | Out-Null
    Start-Sleep -Milliseconds 100; [TG]::PostMessage($h, 0x202, [IntPtr]0, $lp) | Out-Null } }
function Grab { $bmp = New-Object System.Drawing.Bitmap $cw, $ch; $g = [System.Drawing.Graphics]::FromImage($bmp)
  $dc = $g.GetHdc(); [TG]::PrintWindow($h, $dc, 3) | Out-Null; $g.ReleaseHdc($dc); $g.Dispose(); $bmp }
function Save($bmp, [string]$out, [int]$x, [int]$y, [int]$w, [int]$hh, [double]$scale) {
  $small = New-Object System.Drawing.Bitmap ([int]($w * $scale)), ([int]($hh * $scale))
  $g = [System.Drawing.Graphics]::FromImage($small); $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $small.Width, $small.Height), (New-Object System.Drawing.Rectangle $x, $y, $w, $hh), 'Pixel')
  $small.Save($out); "saved $out ($($small.Width)x$($small.Height), crop $x,$y $($w)x$hh, scale $scale)" }
function Crop([string[]]$a, [int]$i) { if ($a.Count -ge $i + 4) { @([int]$a[$i], [int]$a[$i + 1], [int]$a[$i + 2], [int]$a[$i + 3]) } else { @(0, 0, $cw, $ch) } }
function Idle { $b = Grab; $c = $b.GetPixel(415, 545); $b.Dispose(); $c.B -gt $c.R + 60 }   # Recount blue = idle, grey = counting

switch ($cmd) {
  'shot' { $c = Crop $rest 1; $sc = if ($rest.Count -ge 6) { [double]$rest[5] } elseif ($rest.Count -eq 2) { [double]$rest[1] } else { 0.5 }
    Save (Grab) $rest[0] $c[0] $c[1] $c[2] $c[3] $sc }
  'key' { foreach ($k in $rest) { Key $k; Start-Sleep -Milliseconds 400 } }
  'type' { Activate; foreach ($c in ($rest -join ' ').ToCharArray()) { [TG]::PostMessage($h, 0x102, [IntPtr][int]$c, [IntPtr]1) | Out-Null; Start-Sleep -Milliseconds 40 } }
  'click' { Click $rest[0] $rest[1]; Start-Sleep -Milliseconds 500 }
  'rclick' { Flick $rest[0] $rest[1] { param($lp) [TG]::PostMessage($h, 0x204, [IntPtr]2, $lp) | Out-Null
      Start-Sleep -Milliseconds 100; [TG]::PostMessage($h, 0x205, [IntPtr]0, $lp) | Out-Null }; Start-Sleep -Milliseconds 500 }
  'aimkey' { Flick $rest[0] $rest[1] { param($lp) Key $rest[2] } 150; Start-Sleep -Milliseconds 300 }
  'hover' { $c = Crop $rest 3; $sc = if ($rest.Count -ge 8) { [double]$rest[7] } else { 0.5 }
    $script:shot = $null; Flick $rest[0] $rest[1] { param($lp) Start-Sleep -Milliseconds 600; $script:shot = Grab } 0
    Save $script:shot $rest[2] $c[0] $c[1] $c[2] $c[3] $sc }
  'wheel' { $n = [int]$rest[2]
    Flick $rest[0] $rest[1] { param($lp) $s = ScreenOf ([int]$rest[0]) ([int]$rest[1]); $slp = [IntPtr](($s.Y -shl 16) -bor ($s.X -band 0xFFFF))
      for ($i = 0; $i -lt [math]::Abs($n); $i++) { [TG]::PostMessage($h, 0x20A, [IntPtr]([math]::Sign($n) * 120 -shl 16), $slp) | Out-Null; Start-Sleep -Milliseconds 150 } }
    Start-Sleep -Milliseconds 300 }
  'measure' {
    # measure <prefix> [secs=32] [KEY every-s]: needs the dummy count RUNNING (never clicks). Shoots the panel at
    # start and end as <prefix>-0.png / <prefix>-1.png; interval DPS = (avg1*t1 - avg0*t0) / (t1 - t0)
    $pre = $rest[0]; $secs = if ($rest.Count -ge 2) { [int]$rest[1] } else { 32 }
    $k = if ($rest.Count -ge 4) { $rest[2] } else { $null }; $every = if ($rest.Count -ge 4) { [double]$rest[3] } else { 0 }
    if (Idle) { throw "dummy count is not running: press Recount once (or 'click 308 545' with the game in front)" }
    Save (Grab) "$pre-0.png" 0 140 680 300 1 | Out-Null
    $sw = [Diagnostics.Stopwatch]::StartNew(); $next = $every
    while ($sw.Elapsed.TotalSeconds -lt $secs) {
      # Blink aims at the real cursor: aim into the trees left of the hideout dummy spot (blocked, so the
      # character barely moves); override with TLI_AIM="x,y"
      if ($k -and $sw.Elapsed.TotalSeconds -ge $next) { $aim = if ($env:TLI_AIM) { $env:TLI_AIM -split "," } else { 800, 800 }
        Flick ([int]$aim[0]) ([int]$aim[1]) { param($lp) Key $k } 150; $next += $every }
      Start-Sleep -Milliseconds 200 }
    Save (Grab) "$pre-1.png" 0 140 680 300 1 | Out-Null
    "measured $secs s -> $pre-0.png, $pre-1.png" }
  'burst' {
    $out = $rest[0]; $n = [int]$rest[1]; $ms = [int]$rest[2]; $c = Crop $rest 3
    $cols = if ($rest.Count -ge 8) { [int]$rest[7] } else { 6 }; $scale = if ($rest.Count -ge 9) { [double]$rest[8] } else { 0.5 }
    $tw = [int]($c[2] * $scale); $th = [int]($c[3] * $scale); $rows = [math]::Ceiling($n / $cols)
    $sheet = New-Object System.Drawing.Bitmap ($tw * $cols), ($th * $rows); $sg = [System.Drawing.Graphics]::FromImage($sheet)
    $font = New-Object System.Drawing.Font 'Arial', 14; $sw = [Diagnostics.Stopwatch]::StartNew()
    for ($i = 0; $i -lt $n; $i++) {
      $t = $sw.ElapsedMilliseconds; $b = Grab
      $dst = New-Object System.Drawing.Rectangle (($i % $cols) * $tw), ([math]::Floor($i / $cols) * $th), $tw, $th
      $sg.DrawImage($b, $dst, (New-Object System.Drawing.Rectangle $c[0], $c[1], $c[2], $c[3]), 'Pixel'); $b.Dispose()
      $sg.DrawString("$t", $font, [System.Drawing.Brushes]::Yellow, $dst.X + 4, $dst.Y + 4)
      $wait = ($i + 1) * $ms - $sw.ElapsedMilliseconds; if ($wait -gt 0) { Start-Sleep -Milliseconds $wait } }
    $sheet.Save($out); "burst $n frames over $($sw.ElapsedMilliseconds) ms -> $out" }
  default { throw "usage: game.ps1 shot|key|click|hover|wheel|measure|burst ..." }
}
