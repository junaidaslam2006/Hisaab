import { createContext, useContext } from 'react'

// The signed-in shop (Tenant from /api/me), provided by AppLayout.
// { me, reload, setMe }
export const MeContext = createContext({ me: null, reload: () => {}, setMe: () => {} })
export const useMe = () => useContext(MeContext)
