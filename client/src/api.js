import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('unifind-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function getErrorMessage(error) {
  if (!error.response && error.request) {
    return `Cannot reach the UniFind API (${api.defaults.baseURL}). Start the server and make sure its MongoDB connection is working.`
  }
  const responseMessage = error.response?.data?.message
  if (responseMessage) return responseMessage
  if ([502, 503, 504].includes(error.response?.status)) {
    return 'The UniFind API is unavailable. Start the server and check its MongoDB connection, then try again.'
  }
  return error.message || 'Something went wrong. Please try again.'
}

export default api
