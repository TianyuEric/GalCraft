/** Core weather contributions share motion identity, atlas geometry and authoring defaults. */
export const StageWeatherPresets = {
  cherryBlossoms: { title: ['樱花', 'Cherry blossoms', '桜'], texture: 'cherryBlossoms.webp', density: 90, speed: 70, directionDeg: 82, parameters: { columns: 1, size: 30 } },
  snow: { title: ['雪', 'Snow', '雪'], texture: 'snow.png', density: 90, speed: 70, directionDeg: 82, parameters: { columns: 10, size: 14 } },
  rain: { title: ['雨', 'Rain', '雨'], texture: 'rain.png', density: 70, speed: 85, directionDeg: 100, parameters: { columns: 5, size: 95 } },
} as const;
export type StageWeatherPresetKey = keyof typeof StageWeatherPresets;
