// services/skyreelsService.ts
// SkyReels 视频生成服务

const SKYREELS_CONFIG = {
  // 视频生成模型
  VIDEO_MODEL: "skyreels-i2v",

  // API 端点
  SUBMIT_ENDPOINT: "https://apis.skyreels.ai/api/v1/video/multiobject/submit",
  TASK_ENDPOINT: "https://apis.skyreels.ai/api/v1/video/multiobject/task",
};

// Module-level variable to store key at runtime
let runtimeApiKey: string = "";
let runtimeApiUrl: string = SKYREELS_CONFIG.SUBMIT_ENDPOINT;

// Runtime model name (can be overridden by config)
let runtimeVideoModel: string = SKYREELS_CONFIG.VIDEO_MODEL;

/**
 * 设置 API Key
 */
export function setApiKey(key: string): void {
  runtimeApiKey = key ? key : "";
}

/**
 * 设置 API URL
 */
export function setApiUrl(url: string): void {
  runtimeApiUrl = url || SKYREELS_CONFIG.SUBMIT_ENDPOINT;
}

/**
 * 获取 API Key
 */
export function getApiKey(): string {
  return runtimeApiKey;
}

/**
 * 获取 API URL
 */
export function getApiUrl(): string {
  return runtimeApiUrl;
}

/**
 * 设置模型名称
 */
export function setModel(modelName: string): void {
  runtimeVideoModel = modelName || SKYREELS_CONFIG.VIDEO_MODEL;
}

/**
 * 获取当前模型名称
 */
export function getModel(): string {
  return runtimeVideoModel;
}

/**
 * 生成视频（图生视频）
 * @param prompt - 视频提示词
 * @param startImageBase64 - 起始图片的URL或base64
 * @param endImageBase64 - 结束图片的URL或base64（可选）
 * @param duration - 视频时长（秒）
 * @param fullFrame - 是否为完整宫格模式
 * @param imageSize - 图片尺寸（用于判断横竖屏）
 * @returns 视频URL
 */
export async function generateVideo(
  prompt: string,
  startImageBase64?: string,
  endImageBase64?: string,
  duration: number = 5,
  fullFrame: boolean = false,
  imageSize?: string
): Promise<string> {
  if (!runtimeApiKey) {
    throw new Error('SkyReels API Key 未设置');
  }

  try {
    // 构建参考图片数组
    const refImages: string[] = [];

    // 处理起始图片
    if (startImageBase64) {
      if (startImageBase64.startsWith('http')) {
        refImages.push(startImageBase64);
      } else {
        // base64 格式，直接使用
        refImages.push(startImageBase64);
      }
    }

    // 处理结束图片（如果不是宫格模式）
    if (endImageBase64 && !fullFrame) {
      if (endImageBase64.startsWith('http')) {
        refImages.push(endImageBase64);
      } else {
        refImages.push(endImageBase64);
      }
    }

    // 判断横竖屏
    let aspectRatio = "16:9";
    if (imageSize) {
      const [width, height] = imageSize.split('x').map(Number);
      if (height > width) {
        aspectRatio = "9:16";
      }
    }

    // 构建请求体
    const requestBody: any = {
      api_key: runtimeApiKey,
      prompt: prompt,
      ref_images: refImages.length > 0 ? refImages : undefined,
      duration: 5,
      aspect_ratio: aspectRatio
    };

    // 发送生成请求
    const generateResponse = await fetch(runtimeApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      throw new Error(`SkyReels 生成请求失败: ${generateResponse.status} - ${errorText}`);
    }

    const generateData = await generateResponse.json();
    const taskId = generateData.task_id;

    if (!taskId) {
      throw new Error('SkyReels 未返回任务ID');
    }

    // 轮询任务状态
    return await pollTaskStatus(taskId);

  } catch (error) {
    console.error('SkyReels 视频生成失败:', error);
    throw error;
  }
}

/**
 * 查询任务状态
 * @param taskId - 任务ID
 * @returns 任务状态
 */
async function getTaskStatus(taskId: string): Promise<any> {
  const statusUrl = `${SKYREELS_CONFIG.TASK_ENDPOINT}/${taskId}`;

  const response = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`SkyReels 查询任务状态失败: ${response.status}`);
  }

  return await response.json();
}

/**
 * 轮询任务状态直到完成
 * @param taskId - 任务ID
 * @returns 视频URL
 */
async function pollTaskStatus(taskId: string): Promise<string> {
  const maxAttempts = 120; // 最多等待20分钟（每次10秒）
  const pollInterval = 10000; // 10秒

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const taskData = await getTaskStatus(taskId);

      // 检查任务状态
      // SkyReels 可能的状态: 'pending', 'processing', 'completed', 'failed'
      const status = taskData.status;
      if (taskData.code !== 200){
        throw new Error(`SkyReels 获取任务状态失败: ${taskData.message}`);
      }

      if (taskData.data) {
        // 任务完成
        const videoUrl = taskData.data?.video_url;
        if (videoUrl) {
          return videoUrl;
        }
      } else if (status === 'failed') {
        // 任务失败
        const errorMsg = taskData.error_message || taskData.message || '未知错误';
        throw new Error(`SkyReels 视频生成失败: ${errorMsg}`);
      } else if (status === 'pending' || status === 'running' || status === 'unknown' || status === 'submitted') {
        // 任务进行中，继续等待
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } else {
        // 其他状态，继续等待
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      console.warn(`SkyReels 查询任务状态失败 (尝试 ${attempt + 1}/${maxAttempts}):`, error);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error('SkyReels 视频生成超时，请稍后重试');
}
