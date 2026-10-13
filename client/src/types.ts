// Shapes the API sends; they match server/src/db/types.ts.
export type Role = 'inspector' | 'store_owner';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}
