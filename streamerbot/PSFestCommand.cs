using System;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // PSFest explanation - always running challenge
            string message = "PSFest is an ongoing RetroAchievements completion challenge covering 1,834 PlayStation 1, PlayStation 2, and PSP games! " +
                           "The goal is to earn at least one achievement in every single game across these three iconic PlayStation consoles. " +
                           "It's a massive retro gaming marathon that never ends - there's always another classic to discover and conquer! " +
                           "Follow the journey and see progress at the overlay above.";
            
            CPH.SendMessage(message, true);
            return true;
        }
        catch (Exception ex)
        {
            CPH.LogError($"PSFestCommand Error: {ex.Message}");
            return false;
        }
    }
}