Write-Host "Top 10 folders in AppData\Local (GB):"
Get-ChildItem -Path C:\Users\fahri\AppData\Local -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{
        Name = $_.Name
        SizeGB = [math]::Round($size/1GB,2)
    }
} | Sort-Object SizeGB -Descending | Select-Object -First 10 | Format-Table

Write-Host "Top 5 folders in AppData\Roaming (GB):"
Get-ChildItem -Path C:\Users\fahri\AppData\Roaming -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{
        Name = $_.Name
        SizeGB = [math]::Round($size/1GB,2)
    }
} | Sort-Object SizeGB -Descending | Select-Object -First 5 | Format-Table

Write-Host "Top folders in C:\ (GB):"
"Program Files", "Program Files (x86)", "ProgramData", "Users" | ForEach-Object {
    $path = "C:\$_"
    if (Test-Path $path) {
        $size = (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        [PSCustomObject]@{
            Name = $_
            SizeGB = [math]::Round($size/1GB,2)
        }
    }
} | Sort-Object SizeGB -Descending | Format-Table
