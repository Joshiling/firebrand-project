using Api.Endpoints;
using Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient("CompaniesHouse", client =>
{
    var baseUrl = builder.Configuration["CompaniesHouse:BaseUrl"]
        ?? throw new InvalidOperationException("CompaniesHouse:BaseUrl is not configured.");

    client.BaseAddress = new Uri(baseUrl);
});
builder.Services.AddSingleton<ICompanyDatabaseService, CompanyDatabaseService>();
builder.Services.AddSingleton<ICompanySearchService, CompaniesHouseSearchService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.MapCompanyEndpoints();

app.Run();
