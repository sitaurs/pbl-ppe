$d = Get-PSDrive C
Write-Host "C: Used = $([math]::Round($d.Used/1GB,2)) GB, Free = $([math]::Round($d.Free/1GB,2)) GB"

Write-Host "`nAppData subfolders size (GB):"
Get-ChildItem -Path C:\Users\fahri\AppData -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{
        Name = $_.Name
        SizeGB = [math]::Round($size/1GB,2)
    }
} | Sort-Object SizeGB -Descending | Format-Table

Write-Host "Checking some other top-level user folders (Documents, Downloads, Desktop, etc.):"
"Documents", "Downloads", "Desktop", "Videos", "Pictures", "Music" | ForEach-Object {
    $path = "C:\Users\fahri\$_"
    if (Test-Path $path) {
        $size = (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        [PSCustomObject]@{
            Name = $_
            SizeGB = [math]::Round($size/1GB,2)
        }
    }
} | Sort-Object SizeGB -Descending | Format-Table
