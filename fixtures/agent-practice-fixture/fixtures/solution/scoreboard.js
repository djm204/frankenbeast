export function formatScoreboard(players) {
  return [...players]
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .map((player) => `${player.name}: ${player.score}`)
    .join('\n');
}
