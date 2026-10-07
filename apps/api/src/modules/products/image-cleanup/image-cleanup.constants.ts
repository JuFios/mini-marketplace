export const IMAGE_CLEANUP_QUEUE = 'image-cleanup';

/** The recurring job that deletes uploaded pictures no product uses. */
export const SWEEP_ORPHAN_IMAGES_JOB = 'sweep-orphan-images';
export const SWEEP_ORPHAN_IMAGES_SCHEDULER_ID = 'orphan-images';
export const SWEEP_ORPHAN_IMAGES_EVERY_MS = 60 * 60_000;

/**
 * How old an unused picture must be before it is deleted. A picture is uploaded when it is chosen
 * in the product form and attached to the product only when the form is saved, so a young unused
 * file may simply belong to a form that is still open.
 */
export const ORPHAN_IMAGE_MIN_AGE_MS = 24 * 60 * 60_000;
