/**
 * モーション強化。**仕組みだけ。中身はまだ無い。**
 *
 * 企画は `worlds/pve-v3/docs/01-roles.md` 3 章。
 *
 * > ### **中身は決めない**（2026-09-04 の約束）
 * >
 * > **「弓の強化」であることだけが決まっていて、何を強化するかは未定。**
 * > **勝手に決めない。**
 * >
 * > **表が空のあいだ、幕間の 3 択は出ない**——
 * > 仕組みは通っているので、**ここに足せばその場で出る。**
 */

/** 強化 1 つ */
export interface MotionDef {
  readonly id: string;
  readonly name: string;
  /** 何が起きるか。**画面に出す** */
  readonly text: string;
}

/** **まだ空**。中身が決まったらここに足す */
export const MOTIONS: readonly MotionDef[] = [];

/** 3 択を引く。**同じものは出さない** */
export function draw(count: number, rand: () => number = Math.random): readonly MotionDef[] {
  const pool = [...MOTIONS];
  const out: MotionDef[] = [];
  while (out.length < count && pool.length > 0) {
    const i = Math.floor(rand() * pool.length);
    const picked = pool.splice(i, 1)[0];
    if (picked !== undefined) out.push(picked);
  }
  return out;
}

/** 出せるか。**空なら幕間の 3 択を飛ばす** */
export function ready(): boolean {
  return MOTIONS.length >= 1;
}
