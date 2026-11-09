import { createComponent, Types } from '@iwsdk/core';

/** Marks an invisible hit mesh as a UI control. Screen code reads the ids. */
export const UIHit = createComponent('UIHit', {
  screen: { type: Types.String, default: '' },
  control: { type: Types.String, default: '' },
});
