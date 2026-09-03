export function getTrackColor(id: number): string {
  const colors = [
    "#ff90e8", // Gumroad pink
    "#ffc900", // Gumroad yellow
    "#23a094", // Gumroad teal
    "#9090ff", // Bright purple/blue
    "#ff6b6b", // Coral red
    "#4d4d4d", // Dark grey (contrast)
    "#ff9f43", // Vibrant orange
    "#00d2d3", // Aqua blue
  ];
  return colors[id % colors.length];
}
