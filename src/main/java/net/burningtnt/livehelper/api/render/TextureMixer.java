package net.burningtnt.livehelper.api.render;

import com.mojang.blaze3d.ProjectionType;
import com.mojang.blaze3d.buffers.GpuBuffer;
import com.mojang.blaze3d.buffers.GpuBufferSlice;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.shaders.UniformType;
import com.mojang.blaze3d.systems.RenderPass;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.FilterMode;
import com.mojang.blaze3d.textures.GpuTextureView;
import com.mojang.blaze3d.vertex.BufferBuilder;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.MeshData;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import net.burningtnt.livehelper.LiveHelper;
import net.minecraft.client.renderer.ProjectionMatrixBuffer;
import org.joml.Matrix4f;
import org.joml.Vector3f;
import org.joml.Vector4f;

import java.util.Objects;
import java.util.OptionalInt;

public final class TextureMixer implements AutoCloseable {
    private static final RenderPipeline MIX = RenderPipeline.builder()
            .withLocation(LiveHelper.id("mix"))
            .withVertexShader(LiveHelper.id("core/blit"))
            .withFragmentShader(LiveHelper.id("core/mix"))
            .withVertexFormat(DefaultVertexFormat.POSITION_TEX, VertexFormat.Mode.QUADS)
            .withSampler("input0")
            .withSampler("input1")
            .withUniform("Projection", UniformType.UNIFORM_BUFFER)
            .withUniform("DynamicTransforms", UniformType.UNIFORM_BUFFER)
            .build();

    private final GpuBufferSlice projectionMatrix;
    private final int indexCount;
    private final VertexFormat.IndexType indexType;
    private final GpuBuffer vertexBuffer;

    public TextureMixer(int width, int height) {
        BufferBuilder buffer = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
        buffer.addVertex(0.0f, 0.0f, 500.0f).setUv(0, 0);
        buffer.addVertex(width, 0.0f, 500.0f).setUv(1, 0);
        buffer.addVertex(width, height, 500.0f).setUv(1, 1);
        buffer.addVertex(0.0f, height, 500.0f).setUv(0, 1);
        try (MeshData mesh = buffer.buildOrThrow()) {
            this.vertexBuffer = RenderSystem.getDevice().createBuffer(() -> "screen blit mesh vertex buffer", GpuBuffer.USAGE_VERTEX, mesh.vertexBuffer());
            this.indexCount = mesh.drawState().indexCount();
            this.indexType = mesh.drawState().indexType();
        }

        // noinspection resource
        this.projectionMatrix = new ProjectionMatrixBuffer("screen blit").getBuffer(
                new Matrix4f().setOrtho(0, width, 0, height, 0.1f, 1000f, false)
        );
    }

    public void mix(GpuTextureView left, GpuTextureView right, float progress, GpuTextureView target) {
        GpuBufferSlice savedProjectionMatrixBuffer = RenderSystem.getProjectionMatrixBuffer();
        ProjectionType savedProjectionType = RenderSystem.getProjectionType();

        GpuBufferSlice dynamicTransforms = RenderSystem.getDynamicUniforms()
                .writeTransform(new Matrix4f(), new Vector4f(1.0F, 1.0F, 1.0F, progress), new Vector3f(), new Matrix4f());
        RenderSystem.setProjectionMatrix(projectionMatrix, ProjectionType.ORTHOGRAPHIC);
        try (RenderPass renderpass = RenderSystem.getDevice().createCommandEncoder().createRenderPass(() -> "mix", target, OptionalInt.of(0))) {
            RenderSystem.bindDefaultUniforms(renderpass);
            renderpass.setUniform("DynamicTransforms", dynamicTransforms);
            renderpass.bindTexture("input0", left, RenderSystem.getSamplerCache().getClampToEdge(FilterMode.NEAREST));
            renderpass.bindTexture("input1", right, RenderSystem.getSamplerCache().getClampToEdge(FilterMode.NEAREST));
            renderpass.setPipeline(MIX);
            renderpass.setVertexBuffer(0, vertexBuffer);
            renderpass.setIndexBuffer(RenderSystem.getSequentialBuffer(VertexFormat.Mode.QUADS).getBuffer(indexCount), indexType);
            renderpass.drawIndexed(0, 0, indexCount, 1);
        }

        RenderSystem.setProjectionMatrix(savedProjectionMatrixBuffer, savedProjectionType);
    }

    @Override
    public void close() {
        this.projectionMatrix.buffer().close();
    }
}
