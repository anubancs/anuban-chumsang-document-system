export type RoleCode = 'admin' | 'director' | 'officer' | 'staff'

export interface Profile {
  id: string
  employee_code: string | null
  full_name: string
  email: string | null
  phone: string | null
  department_id: string | null
  position: string | null
  is_active: boolean
}

export interface DashboardStats {
  incoming: number
  outgoing: number
  assigned: number
}
