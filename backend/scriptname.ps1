$restaurantId = "rest-001"
Get-Content streets.csv | ForEach-Object {
    $parts = $_ -split ","
    if ($parts.Length -eq 2) {
        "$restaurantId,$($parts[0]),$($parts[1])"
    }
} | Set-Content streets-with-restaurant.csv