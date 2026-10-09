import { useEffect } from 'react';
const g = globalThis as any; g.__routes = g.__routes || [];
export const useRouter = () => ({ push: (r: any) => g.__routes.push(r), back() {}, replace(r: any) { g.__routes.push(r); } });
export const useFocusEffect = (cb: () => any) => { useEffect(() => cb(), [cb]); };
