// MaxFitness mashqlar kutubxonasi (uyda, jihozsiz). fitness.ts (reja) va coach.ts (ovozli murabbiy) uchun umumiy.

export interface ExerciseItem {
  id: string;
  name: string;
  how: string;
  kind: "warmup" | "aerobic" | "strength" | "balance" | "stretch";
  minutes?: number;
  sets?: number;
  reps?: number;
  seconds?: number;
  note?: string;
}

export const EXERCISES = {
  warmup: { id: "warmup", name: "Badan qizdirish", kind: "warmup", how: "Joyida sekin yurish, yelka va bilaklarni aylantirish, chuqur nafas." },
  brisk_walk: { id: "brisk_walk", name: "Tez yurish", kind: "aerobic", how: "Gapira oladigan, lekin qo'shiq ayta olmaydigan tezlikda yuring. Uyda bo'lsa — joyida yurish yoki zinapoya." },
  bike: { id: "bike", name: "Velosiped / velotrenajyor", kind: "aerobic", how: "Bo'g'imga yuk tushmaydi. O'rtacha tezlikda, bir xil maromda." },
  swim: { id: "swim", name: "Suzish yoki suvda yurish", kind: "aerobic", how: "Bo'g'im va belga eng yengil aerob mashq." },
  march: { id: "march", name: "Joyida yurish (tizzalarni ko'tarib)", kind: "aerobic", how: "Qo'llarni silkitib, joyida yuring. Musiqa bilan qulayroq." },
  chair_squat: { id: "chair_squat", name: "Stulga o'tirib-turish", kind: "strength", how: "Stul oldida turing, sekin o'tiring va qo'lsiz turing. Tizza oyoq uchidan o'tmasin. Nafasni ushlamang: turishda nafas chiqaring." },
  wall_pushup: { id: "wall_pushup", name: "Devorga tayanib otjimaniya", kind: "strength", how: "Devordan bir qadam narida turing, kaftlar yelka kengligida. Ko'krakni devorga yaqinlashtirib, qaytaring." },
  bridge: { id: "bridge", name: "Ko'prik (yotib, tos ko'tarish)", kind: "strength", how: "Chalqancha yoting, tizzalar bukilgan. Tosni ko'tarib 2 soniya ushlang, sekin tushiring." },
  bird_dog: { id: "bird_dog", name: "Qo'l-oyoq cho'zish (to'rt oyoqda)", kind: "strength", how: "Tizza va kaftlarga tayaning. Qarama-qarshi qo'l va oyoqni to'g'rilang, 2 soniya, almashtiring. Bel uchun xavfsiz." },
  calf_raise: { id: "calf_raise", name: "Oyoq uchida ko'tarilish", kind: "strength", how: "Stul suyanchig'iga tayanib, oyoq uchida ko'tariling va sekin tushing." },
  side_lying_leg: { id: "side_lying_leg", name: "Yonboshlab oyoq ko'tarish", kind: "strength", how: "Yonboshlab yoting, ustki oyoqni to'g'ri holda sekin ko'tarib tushiring." },
  single_leg: { id: "single_leg", name: "Bir oyoqda turish", kind: "balance", how: "Stul suyanchig'iga yengil tayanib, bir oyoqda turing. Oson bo'lsa — tayanmasdan." },
  heel_toe: { id: "heel_toe", name: "Tovondan-uchiga yurish", kind: "balance", how: "Bir oyoq tovonini ikkinchisining uchiga qo'yib, to'g'ri chiziq bo'ylab yuring. Devor yonida bajaring." },
  stretch: { id: "stretch", name: "Cho'zilish va nafas", kind: "stretch", how: "Son, boldir, yelka mushaklarini 20–30 soniyadan sekin cho'zing. Og'riq bo'lmasin." },
} as const satisfies Record<string, Omit<ExerciseItem, "minutes" | "sets" | "reps" | "seconds" | "note">>;
