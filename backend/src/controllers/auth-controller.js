import cloudinary from "../lib/cloudinary.js";
import generateToken from "../lib/utils.js";
import User from "../models/user-model.js";
import bcrypt from "bcryptjs"

export const signup = async (req, res) => {
    const { fullName, email, password } = req.body
    console.log("req here", req.body)
    try {
        if (!fullName || !email || !password) {
            console.log("erroe here")
            return res.status(400).json({
                message: "All fields are required"
                
            })
            
        }

        //hash password
        if (password.length < 6) {
            return res.status(400).json({ message: "password must be atleast 6 characters" });
        }

        const user = await User.findOne({ email })
        if (user) {
            return res.status(400).json({ message: "user already exists" });
        }
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new User({
            fullName,
            email,
            password: hashedPassword
        })
        console.log("user here", newUser)

        if (newUser) {
            //genertate jsonwebtoken here
            await newUser.save();
            console.log("user saved here")
            generateToken(newUser._id, res)
            res.status(201).json({
                message: "new user created",
                _id: newUser._id,
                fullName: newUser.fullName,
                email: newUser.email,
                profilePic: newUser.profilePic
            })
        } else {
            res.status(400).json({ message: "invalid user data" })
        }

    } catch (error) {
        console.log("error in sign up ", error)
        res.status(500).json({ message: "internal server error" })

    }
}

export const login = async (req, res) => {
    const {email, password} = req.body
    try {
        const user = await User.findOne({email})

        if(!user){
            return res.status(400).json({message: "Invalid Credentital"})
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password)
        if (!isPasswordCorrect){
            return res.status(400).json({message:"invalid credential"})
        }

        generateToken(user._id, res)
        res.status(200).json({message:"logged in",
            _id:user._id,
            fullName: user.fullName,
            email: user.email,
            profilePic: user.profilePic

        })
    } catch (error) {
        console.log("error in login controller")
        res.status(500).json({
            message: "internal server error"
        })
    }
}

export const logout = (req, res) => {
    try {
       res.cookie("jwt", "", {
        maxAge: 0
       })
       res.status(200).json({message:"logged out successfully"})
    } catch (error) {
        res.status(500).json({
            message: "internal server error"
        })
        
    }
}

export const updateProfile=async(req, res)=>{
    try {
        const {profilePic}= req.body
        const userId=  req.user._id

        if(!profilePic){
            return res.status(400).json({message: "Profile pic is required"})
        }

        const uploadResponse = await cloudinary.uploader.upload(profilePic)
        const updateUser = await User.findByIdAndUpdate(userId,{
            profilePic: uploadResponse.secure_url
        },
    {new:true })

    res.status(200).json(updateUser)
    } catch (error) {
        console.log("error in update profile", error)
        res.status(500).json({message: " internal server error"})
    }
}

export const checkAuth = (req, res) =>{
    try {
        res.status(200).json(req.user)
    } catch (error) {
        console.log("error in checkAuth", error.message)
        res.status(500).json({message:" internal server error"})
    }
}