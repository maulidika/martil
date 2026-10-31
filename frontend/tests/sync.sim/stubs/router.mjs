export const navCalls = []
export const useNavigate = () => (to, opts) => navCalls.push([to, opts])
