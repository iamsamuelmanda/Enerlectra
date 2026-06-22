export interface Cluster {
    clusterId: string
    name: string
    location: {
      district: string
      province: string
      lat?: number
      lng?: number
    }
    target_kW: number
    status: 'open'
    createdAt: string
  }
  
