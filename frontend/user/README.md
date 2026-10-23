# Royalty Hair and Nails Studio — user frontend

## Run locally

From this directory:

```sh
npm install
npm run dev
```

Use `npm run lint` to check the code and `npm run build` to create a production
build. Google Fonts are loaded from Google Fonts at runtime.

## Sample content and photos

Sample service details and image paths are in `src/data/sample-data.js`. Replace
the files under `public/images/` and update the paths in that module when adding
real photos. It includes the hero, story, service, and gallery images. Each
gallery row repeats its five configured images to fill ten tiles.

Login and Signin are UI previews only; authentication and Google sign-in are not
connected to a backend. The appointment and service booking buttons open the
Login overlay.

## Empty-state illustrations

Empty states load replaceable placeholder art from `public/images/empty-states/`
by stable filename — replace the file, keep the name, and the new artwork is
picked up automatically. See `public/images/empty-states/ASSET-INDEX.md` for the
filename-to-state map and recommended dimensions.
