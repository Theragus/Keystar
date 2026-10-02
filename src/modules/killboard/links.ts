/** zKillboard deep links. Isomorphic. */
const ZKILL = "https://zkillboard.com";

export const zkillKill = (id: number) => `${ZKILL}/kill/${id}/`;
export const zkillCharacter = (id: number) => `${ZKILL}/character/${id}/`;
export const zkillCorporation = (id: number) => `${ZKILL}/corporation/${id}/`;
export const zkillShip = (id: number) => `${ZKILL}/ship/${id}/`;
export const zkillSystem = (id: number) => `${ZKILL}/system/${id}/`;
