import jwt from "jsonwebtoken"

const generateToken =(userId, res)=>{
    const token = jwt.sign({userId}, process.env.JWT_SECRET, {
        expiresIn:"7d"
    })

    res.cookie("jwt", token,{
        maxAge: 7*24*60*60*1000, //ms
        httpOnly: true, // prevent xss attack 
        sameSite: "strict", // csrf attack cross site request forgery attacks
        secure: process.env.NODE_ENV != "development"

    })

    return token;

}

export default generateToken