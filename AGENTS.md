# Artwork workflow

- Update or create a line drawing before generating artwork when its composition, pose, or other structure needs to change. Let the user review it before generating, unless they explicitly request both steps together.
- Use the approved line drawing as the composition reference. Keep the desk clock as a separate interactive layer unless the user requests otherwise.
- Generate emotion expressions as complete sprites using the selected neutral sprite and expression line drawing as references. Use a local patch only for blinking: generate multiple independent candidates, compare eye alignment and changes to eyebrows and hair, then apply only the eye areas with a soft edge. Check for remaining open-eye lashes, shifted hair or brows, seams, and flicker in the actual page before calling it done. Use lossless WebP for character sprites and keep established asset names.
