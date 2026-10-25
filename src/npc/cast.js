// The people about the resort who aren't you (see npc.js, which builds them,
// and the NPCs in main.js, which places them and has them speak).
//
// `rider` is the model they wear, one of RIDER_MODELS; `pose` how they're
// posed (npc.js's POSES); `home` the landmark whose seat they sit on (a summit
// object with a room, as yurtSpace() gives the yurt). Walking into that room
// starts them talking: `lines`, one after another, E (or a tap) for the next;
// [text](url) in a line is a link.
export const CAST = [
  {
    id: 'eric', name: 'Eric', rider: 'male', pose: 'crossLegged', home: 'summit:object-1',
    lines: ["Hi, I'm Eric, the creator of this game! Follow me on X [@redknots](https://x.com/redknots) for updates."],
  },
];
