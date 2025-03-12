import React, { useState } from 'react'
import { useAuth } from '../store/useAuth';
import AuthImagePattern from '../components/AuthImagePattern';
import toast from 'react-hot-toast';

const Signup = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        password: "",
    })

    const { isSignup } = useAuth()

    const validateForm = () => {
        //validation here
        if (!formData.fullName.trim()) {
            return toast.error("fullname is required")
        }
        if (!formData.email.trim()) {
            return toast.error("email is required")

        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            return toast.error("invalid email format")
        }
        if (formData.password.length<6) {
            return toast.error("Password must be atleast 6 character")
        }
        return true
    }
        
        const handleChange = (e) => {
            setFormData({ ...formData, [e.target.name]: e.target.value })
        }

        const handleSubmit = async (e) => {
            e.preventDefault()
            const success = validateForm()
            if(success === true){
               await isSignup(formData)
            }
        }

        return (
            <div>
                <div className="flex justify-center items-center min-h-screen bg-gray-100 px-4">
                    <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
                        <h2 className="text-2xl font-bold text-center mb-4">Signup</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium">Full Name</label>
                                <input
                                    type="text"
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Password</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-2 top-2 text-sm"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? "Hide" : "Show"}
                                    </button>
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition"
                            >
                                Signup
                            </button>
                        </form>
                    </div>
                </div>
                <AuthImagePattern
                    title="xyz something"
                    subtitle="abc something" />
            </div>
        )
}
    export default Signup
