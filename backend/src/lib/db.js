import mongoose from "mongoose"

const connectDB = async ()=>{
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`connect to the DB : ${conn.connection.host}`)
    } catch (error) {
        console.log("mongo connection error:", error)
        
    }
}

export default connectDB