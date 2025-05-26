import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // 加载 .env 文件中的环境变量

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Mongoose 6 及以上版本不再需要以下选项，它们已成为默认值或被移除
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // useCreateIndex: true, // Mongoose 6 中已移除, 默认为 true
      // useFindAndModify: false, // Mongoose 6 中已移除
    });

    console.log(`MongoDB 已连接: ${conn.connection.host}`);
  } catch (error) {
    console.error(`数据库连接错误: ${error.message}`);
    process.exit(1); // 连接失败时退出应用
  }
};

export default connectDB;
