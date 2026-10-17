import { expect, type Locator } from '@playwright/test';

// The box of something its springs move, once they have come to rest: the same twice in a row.
// A slow machine is still animating when the page first answers.
export async function settledBox(target: Locator) {
  let last = '';
  await expect
    .poll(
      async () => {
        const box = await target.boundingBox();
        const key = box ? [box.x, box.y, box.width, box.height].map(Math.round).join() : '';
        const same = key !== '' && key === last;
        last = key;
        return same;
      },
      { intervals: [120] },
    )
    .toBe(true);
  return (await target.boundingBox())!;
}
