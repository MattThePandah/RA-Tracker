using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // Path to the games.json file
            string gamesFilePath = @"D:\Development\Streaming\Game Info Grabber\games.json";
            
            if (!File.Exists(gamesFilePath))
            {
                CPH.SendMessage("Games database not found!", true);
                return false;
            }
            
            // Read and parse games.json
            string jsonContent = File.ReadAllText(gamesFilePath);
            JArray games = JArray.Parse(jsonContent);
            
            // Filter completed games only
            var completedGames = games
                .Where(g => g["status"]?.ToString() == "Completed")
                .ToList();
            
            if (!completedGames.Any())
            {
                CPH.SendMessage("No completed games yet! The leaderboard awaits your first conquest.", true);
                return true;
            }
            
            // Sort by completion time (fastest first) - assuming completion_time is in minutes
            var fastestCompletions = completedGames
                .Where(g => g["completion_time"] != null && 
                           double.TryParse(g["completion_time"].ToString(), out double _))
                .OrderBy(g => double.Parse(g["completion_time"].ToString()))
                .Take(3)
                .ToList();
            
            // Sort by rating (highest first)  
            var topRatedGames = completedGames
                .Where(g => g["rating"] != null && 
                           double.TryParse(g["rating"].ToString(), out double _))
                .OrderByDescending(g => double.Parse(g["rating"].ToString()))
                .Take(3)
                .ToList();
            
            // Sort by console completion count
            var consoleLeaderboard = completedGames
                .GroupBy(g => g["console"]?.ToString() ?? "Unknown")
                .OrderByDescending(group => group.Count())
                .Take(3)
                .ToList();
            
            // Build leaderboard message
            string message = "PSFest Leaderboard: ";
            
            // Show console leaderboard (most relevant)
            if (consoleLeaderboard.Any())
            {
                message += "Top consoles: ";
                var consoleStats = consoleLeaderboard.Select(group => {
                    string consoleName = group.Key switch {
                        "PlayStation" => "PS1",
                        "PlayStation 2" => "PS2",
                        "PlayStation Portable" => "PSP",
                        _ => group.Key
                    };
                    return $"{consoleName} ({group.Count()})";
                });
                message += string.Join(", ", consoleStats);
            }
            
            // Add fastest completions if available
            if (fastestCompletions.Any())
            {
                message += " | Fastest: ";
                var fastestGame = fastestCompletions.First();
                string title = fastestGame["title"]?.ToString() ?? "Unknown";
                double timeMinutes = double.Parse(fastestGame["completion_time"].ToString());
                
                // Convert to readable format
                string timeString;
                if (timeMinutes < 60)
                {
                    timeString = $"{timeMinutes:F0}min";
                }
                else
                {
                    double hours = timeMinutes / 60;
                    timeString = $"{hours:F1}h";
                }
                
                message += $"{title} ({timeString})";
            }
            
            // Add top rated if available
            if (topRatedGames.Any())
            {
                message += " | Top rated: ";
                var topGame = topRatedGames.First();
                string title = topGame["title"]?.ToString() ?? "Unknown";
                string rating = topGame["rating"]?.ToString() ?? "0";
                message += $"{title} ({rating}★)";
            }
            
            CPH.SendMessage(message, true);
            return true;
        }
        catch (FileNotFoundException)
        {
            CPH.SendMessage("Games database not found! Make sure the Game Info Grabber is set up correctly.", true);
            return false;
        }
        catch (JsonException ex)
        {
            CPH.SendMessage("Error reading games database.", true);
            CPH.LogError($"LeaderboardCommand JSON Error: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage("Error retrieving leaderboard information.", true);
            CPH.LogError($"LeaderboardCommand Error: {ex.Message}");
            return false;
        }
    }
}