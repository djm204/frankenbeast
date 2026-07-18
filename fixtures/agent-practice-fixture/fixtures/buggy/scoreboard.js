export function formatScoreboard(players) {
  return players
    .map((player) => `${player.name}: ${player.score}`)
    .join('\n');
}
