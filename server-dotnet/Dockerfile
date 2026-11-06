# Build from the repo root:  docker build -f server-dotnet/Dockerfile -t skia-scene-render .
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY apps/web/public/fonts apps/web/public/fonts
COPY server-dotnet server-dotnet
RUN dotnet publish server-dotnet/SkiaScene.Server -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "SkiaScene.Server.dll"]
