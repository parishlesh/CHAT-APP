import jwt from "jsonwebtoken"

import User from "../models/user-model.js"

const protectRoute=async (req, res, next)=>{
    try {
        const token = req.cookies.jwt

        if(!token){
            return res.status(401).json({message:"unauthorized- no token provided"})
        }

        const decode = jwt.verify(token, process.env.JWT_secret)

        if(!decode){
            return res.status(401).json({message:"unauthorized- invalid token"})
        }

        const user = await User.findById(decode.userId).select("-password")

        if(!user){
            return res.status(404).json({message:"User not found"})
        }

        req.user = user
        next()
    } catch (error) {
        console.log("error in protectRoute middleware: ", error.message)
        res.status(500).json({message:"internal server error"})
    }

}
export default protectRoute