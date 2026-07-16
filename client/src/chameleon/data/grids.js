export const GRIDS = {
  fastFood: {
    name: "Fast Food Chains",
    rowHints: [
      "Burger-focused American fast food chains",
      "Mexican-style fast food chains",
      "Sub and sandwich shops",
      "Fried chicken chains",
    ],
    rows: [
      ["McDonald's", "Burger King", "Wendy's", "Sonic"],
      ["Taco Bell", "Chipotle", "Qdoba", "Del Taco"],
      ["Subway", "Jersey Mike's", "Jimmy John's", "Firehouse Subs"],
      ["Popeyes", "KFC", "Chick-fil-A", "Raising Cane's"],
    ],
  },
  movieGenres: {
    name: "Movie Genres & Tropes",
    rowHints: [
      "Classic Hollywood genre categories",
      "Mainstream adult cinema styles",
      "Niche pop-culture genre mashups",
      "Niche and hybrid audience genres",
    ],
    rows: [
      ["Sci-Fi", "Fantasy", "Horror", "Comedy"],
      ["Romance", "Action", "Thriller", "Documentary"],
      ["Superhero", "Cyberpunk", "Zombie", "Space Opera"],
      ["Slasher", "Rom-Com", "Mockumentary", "Western"],
    ],
  },
  animals: {
    name: "Animals",
    rowHints: [
      "Wild big cats",
      "Bears and bear-like animals",
      "Large ocean creatures",
      "Birds of prey",
    ],
    rows: [
      ["Lion", "Tiger", "Leopard", "Cheetah"],
      ["Grizzly Bear", "Polar Bear", "Panda", "Koala"],
      ["Dolphin", "Whale", "Shark", "Orca"],
      ["Eagle", "Hawk", "Falcon", "Owl"],
    ],
  },
};

export const GRID_KEYS = ["fastFood", "movieGenres", "animals"];

const ROW_LABELS = ["A", "B", "C", "D"];

export function coordToWord(gridKey, coord) {
  const grid = GRIDS[gridKey];
  if (!grid || !coord) return null;
  const r = ROW_LABELS.indexOf(coord[0]);
  const c = parseInt(coord[1], 10) - 1;
  if (r < 0 || c < 0 || c > 3) return null;
  return grid.rows[r][c];
}
