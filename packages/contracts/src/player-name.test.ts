import { expect, it } from 'vitest';
import { countNameCharacters, CurrentMainStorySchema, PlayerNameSchema } from './index.js';
import { FixtureIds } from './fixtures.js';

it('uses trimmed visible characters and preserves defaults for existing works', () => {
  const name={characterId:FixtureIds.an,defaultName:'  春👩‍🚀é  ',allowCustom:true,variableId:FixtureIds.relation};
  expect(countNameCharacters(name.defaultName)).toBe(3);
  expect(PlayerNameSchema.parse(name)).toMatchObject({defaultName:'春👩‍🚀é',maxLength:24,promptPolicy:'always'});
  expect(PlayerNameSchema.safeParse({...name,maxLength:3}).success).toBe(true);
  expect(PlayerNameSchema.safeParse({...name,maxLength:2}).success).toBe(false);
  expect(PlayerNameSchema.safeParse({...name,defaultName:'   '}).success).toBe(false);
  expect(PlayerNameSchema.safeParse({...name,maxLength:1,defaultName:'👩‍🚀',promptPolicy:'firstAndAfterCompletion'}).success).toBe(true);
  for(const maxLength of [0,101,1.5])expect(PlayerNameSchema.safeParse({...name,maxLength}).success).toBe(false);
  expect(CurrentMainStorySchema.safeParse({characterId:FixtureIds.an,variableId:null,effectiveName:'   ',completed:false}).success).toBe(false);
});
