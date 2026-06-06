package net.burningtnt.livehelper.render;

import com.mojang.blaze3d.buffers.GpuBuffer;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferBuilder;
import com.mojang.blaze3d.vertex.MeshData;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import net.minecraft.client.Minecraft;
import org.joml.Matrix4f;
import org.joml.Vector3f;
import org.joml.Vector4f;

import javax.annotation.Nullable;
import java.util.Objects;
import java.util.OptionalDouble;
import java.util.OptionalInt;
import java.util.function.Consumer;
import java.util.function.Supplier;


public class CachedMesh implements AutoCloseable {
    
    public final String name;
    public final VertexFormat.Mode mode;
    public final VertexFormat format;
    public final Supplier<MeshData> initFunc;
    
    private volatile int indexCount = -1;
    private boolean sequentialIndexBuffer = false;
    @Nullable
    private VertexFormat.IndexType indexType;
    
    @Nullable
    private GpuBuffer vertexBuffer;
    
    @Nullable
    private GpuBuffer indexBuffer;
    
    public CachedMesh(String name, RenderPipeline pipeline, Consumer<BufferBuilder> initFunc, boolean immediate ){
        this(name, pipeline.getVertexFormatMode(), pipeline.getVertexFormat(), initFunc);
        if(immediate){
            this.init();
        }
    }
    
    public CachedMesh(String name, VertexFormat.Mode mode, VertexFormat format, Consumer<BufferBuilder> initFunc) {
        this.name = name;
        this.mode = mode;
        this.format = format;
        this.initFunc = () -> {
            var bufferBuilder = Tesselator.getInstance().begin(mode, format);
            initFunc.accept(bufferBuilder);
            return bufferBuilder.buildOrThrow();
        };
    }
    
    public CachedMesh(String name, VertexFormat.Mode mode, VertexFormat format, Supplier<MeshData> initFunc) {
        this.name = name;
        this.mode = mode;
        this.format = format;
        this.initFunc = initFunc;
    }
    
    public void checkInit(){
        if(indexCount == -1){
            synchronized (this){
                if(indexCount == -1){
                    init();
                }
            }
        }
    }
    
    private void init(){
        try(var mesh = initFunc.get()) {
            this.vertexBuffer = RenderSystem.getDevice().createBuffer(() -> name + "mesh vertex buffer",GpuBuffer.USAGE_VERTEX ,mesh.vertexBuffer());
            var state = mesh.drawState();
            this.indexCount = state.indexCount();
            this.indexType = state.indexType();
            if(mesh.indexBuffer() == null){
                this.sequentialIndexBuffer = true;
            }
            else {
                this.indexBuffer = RenderSystem.getDevice().createBuffer(() -> name + "mesh index buffer", GpuBuffer.USAGE_INDEX , Objects.requireNonNull(mesh.indexBuffer()));
            }
        }
    }
    
    public void render(RenderPipeline pipeline, PoseStack poseStack) {
        var colorTarget = Minecraft.getInstance().getMainRenderTarget().getColorTextureView();
        var depthTarget = Minecraft.getInstance().getMainRenderTarget().getDepthTextureView();
        if(colorTarget == null || depthTarget == null) return;
        
        var modelView = RenderSystem.getModelViewStack().mul(poseStack.last().pose(), new Matrix4f());
        var transformUBO = RenderSystem.getDynamicUniforms().writeTransform(modelView, new Vector4f(1,1,1,1), new Vector3f(), new Matrix4f());
        try (var renderpass = RenderSystem.getDevice().createCommandEncoder()
                .createRenderPass(() -> name + " mesh rendering",colorTarget, OptionalInt.empty(), depthTarget, OptionalDouble.empty())){
            RenderSystem.bindDefaultUniforms(renderpass);
            renderpass.setPipeline(pipeline);
            renderpass.setUniform("DynamicTransforms", transformUBO);
            renderpass.setVertexBuffer(0, this.getVertexBuffer());
            renderpass.setIndexBuffer(this.getIndexBuffer(),this.getIndexType());
            renderpass.drawIndexed(0,0, indexCount, 1);
        }
    }
    
    public GpuBuffer getVertexBuffer(){
        checkInit();
        return vertexBuffer;
    }
    
    public GpuBuffer getIndexBuffer(){
        checkInit();
        if(sequentialIndexBuffer){
            return RenderSystem.getSequentialBuffer(mode).getBuffer(indexCount);
        }
        return indexBuffer;
    }
    
    public VertexFormat.IndexType getIndexType(){
        checkInit();
        if(sequentialIndexBuffer){
            return RenderSystem.getSequentialBuffer(mode).type();
        }
        return indexType;
    }
    
    public int getIndexCount(){
        checkInit();
        return indexCount;
    }
    
    @Override
    public void close() {
        if(vertexBuffer != null){
            vertexBuffer.close();
        }
        if(indexBuffer != null){
            indexBuffer.close();
        }
    }
}
